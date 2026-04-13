import functools
import json
import math
from typing import List, Dict, Optional
from icm_tool import calculate_icm, compute_bubble_factor
from equity_engine import Range, Card, compute_win_rate_fast

# 169ハンドの定義
RANKS = 'AKQJT98765432'
RANK_VALUE = {r: i for i, r in enumerate(RANKS)}

def get_169_hands() -> List[str]:
    hands = []
    for r in RANKS: hands.append(r + r)
    for i in range(len(RANKS)):
        for j in range(i + 1, len(RANKS)):
            hands.append(RANKS[i] + RANKS[j] + 's')
    for i in range(len(RANKS)):
        for j in range(i + 1, len(RANKS)):
            hands.append(RANKS[i] + RANKS[j] + 'o')
    return hands

# --- 【重大修正】真のICM計算エンジン（賞金EV算出） ---
def calculate_icm_prize_ev(stacks: List[float], payouts: List[float], bb_size: float = 100.0) -> List[float]:
    """
    stacks: チップ枚数 / payouts: 賞金リスト
    内部でBB正規化を行い、順位確率から「賞金期待値（Prize EV）」を算出する。
    """
    n = len(stacks)
    m = len(payouts)
    
    # 【追加: BB正規化】
    norm_stacks = [float(s) / bb_size for s in stacks]
    full_payouts = [float(p) for p in payouts] + [0.0] * (max(0, n - m))
    
    @functools.lru_cache(maxsize=None)
    def compute_placement_prize_evs(player_indices: frozenset, payout_idx: int) -> Dict[int, float]:
        num_players = len(player_indices)
        if num_players == 0 or payout_idx >= n:
            return {idx: 0.0 for idx in player_indices}
        
        if num_players == 1:
            idx = next(iter(player_indices))
            return {idx: sum(full_payouts[payout_idx:])}
            
        subset_total = sum(norm_stacks[idx] for idx in player_indices)
        evs = {idx: 0.0 for idx in player_indices}
        
        if subset_total <= 0:
            share = sum(full_payouts[payout_idx:]) / num_players
            return {idx: share for idx in player_indices}
            
        # 現在の順位の賞金額
        current_prize_value = full_payouts[payout_idx]
        
        for p in player_indices:
            # プレイヤーpがこの順位を獲得する確率（スタック比率）
            prob_p_is_next = norm_stacks[p] / subset_total
            
            # 再帰的に後続の順位EVを計算
            remaining_indices = player_indices - {p}
            sub_results = compute_placement_prize_evs(remaining_indices, payout_idx + 1)
            
            # p自身のこの順位の賞金期待値を加算
            evs[p] += prob_p_is_next * current_prize_value
            # 他のプレイヤーがこの順位をとった場合の期待値を合算
            for q, ev_q in sub_results.items():
                evs[q] += prob_p_is_next * ev_q
                
        return evs

    indices = frozenset(range(n))
    result_dict = compute_placement_prize_evs(indices, 0)
    return [result_dict[i] for i in range(n)]

# 対レンジ勝率（概算モデル）
def get_equity_vs_range(hand: str, v_range_pct: float) -> float:
    r1, r2 = hand[0], hand[1]
    v1, v2 = RANKS.find(r1), RANKS.find(r2)
    is_pair = r1 == r2
    is_suited = hand.endswith('s')
    
    base = 0.50 + (12 - v1) * 0.03 if is_pair else 0.30 + (12 - v1) * 0.02 + (12 - v2) * 0.015
    if is_suited: base += 0.04
    tightness = 1.0 - v_range_pct
    return max(0.05, min(0.95, base - (tightness * 0.2)))

# --- 【重大修正】ICM賞金EVに基づいた分析 ---
def analyze_call_range_icm(stacks: List[int], payouts: List[int], hero_idx: int, villain_idx: int, villain_range_pct: float):
    # 1. Fold Prize EV
    ev_fold = calculate_icm_prize_ev(stacks, payouts)[hero_idx]
    
    risk_stack = min(stacks[hero_idx], stacks[villain_idx])
    
    # 2. Win Prize EV
    win_stacks = list(stacks)
    win_stacks[hero_idx] += risk_stack
    win_stacks[villain_idx] -= risk_stack
    ev_win = calculate_icm_prize_ev(win_stacks, payouts)[hero_idx]
    
    # 3. Lose Prize EV
    lose_stacks = list(stacks)
    lose_stacks[hero_idx] -= risk_stack
    lose_stacks[villain_idx] += risk_stack
    ev_lose = calculate_icm_prize_ev(lose_stacks, payouts)[hero_idx]
    
    # 【修正】賞金期待値による必要勝率算出
    denom = (ev_win - ev_lose)
    p_req = (ev_fold - ev_lose) / denom if denom > 0 else 1.0
    
    all_hands = get_169_hands()
    call_range = [h for h in all_hands if get_equity_vs_range(h, villain_range_pct) >= p_req]
    
    return {
        "required_equity": round(p_req, 3),
        "call_range": call_range,
        "ev_data": {"fold": ev_fold, "win": ev_win, "lose": ev_lose}
    }

def draw_heatmap(call_range: List[str]):
    print("\n   " + " ".join(list(RANKS)))
    for i, r1 in enumerate(RANKS):
        row = f"{r1} "
        for j, r2 in enumerate(RANKS):
            if i == j: h = r1 + r1
            elif i < j: h = r1 + r2 + 's'
            else: h = r2 + r1 + 'o'
            row += " ■" if h in call_range else " ."
        print(row)

# --- ⑤ 次BBリスクスコア (Risk Score) ---
def calculate_risk_score(stack: float, blinds_total: float, orbit_left: int) -> float:
    """
    risk_score = orbit_left / stack_ratio
    stack_ratio = stack / blinds_total
    """
    stack_ratio = stack / blinds_total if blinds_total > 0 else 1.0
    if stack_ratio <= 0: return 999.0
    return orbit_left / stack_ratio

# --- ④ ハンド単位評価モード ---
def evaluate_specific_hand(
    hand_str: str, 
    stacks: List[float], 
    payouts: List[float], 
    hero_idx: int, 
    villain_idx: int,
    villain_push_range: Dict[str, float],
    blinds_total: float,
    orbit_left: int
) -> Dict:
    """特定ハンド（例: 'AhKd'）の各種指標を計算"""
    # Blocker考慮のためのRangeオブジェクト
    v_range = Range(villain_push_range)
    
    # 既存の ICM 賞金 EV メソッドを利用
    fold_ev = calculate_icm_prize_ev(stacks, payouts)[hero_idx]
    
    risk_stack = min(stacks[hero_idx], stacks[villain_idx])
    
    # Win/Lose Stacks
    win_s = list(stacks); win_s[hero_idx] += risk_stack; win_s[villain_idx] -= risk_stack
    lose_s = list(stacks); lose_s[hero_idx] -= risk_stack; lose_s[villain_idx] += risk_stack
    
    win_ev = calculate_icm_prize_ev(win_s, payouts)[hero_idx]
    lose_ev = calculate_icm_prize_ev(lose_s, payouts)[hero_idx]
    
    # Win Rate (Range vs Specific Hand with Blockers)
    # Note: hand_str 'AhKd' -> 'AsKs' logic or mapping needed. For now assume formatted 'AhKd'
    eq = compute_win_rate_fast(hand_str, v_range)
    
    push_ev = eq * win_ev + (1 - eq) * lose_ev
    bf = compute_bubble_factor(stacks, payouts, hero_idx, villain_idx)
    
    risk_score = calculate_risk_score(stacks[hero_idx], blinds_total, orbit_left)
    
    return {
        "hand": hand_str,
        "push_ev": round(push_ev, 4),
        "fold_ev": round(fold_ev, 4),
        "diff": round(push_ev - fold_ev, 4),
        "bubble_factor": round(bf, 2),
        "required_equity": round((fold_ev - lose_ev) / (win_ev - lose_ev), 3),
        "current_equity": round(eq, 3),
        "risk_score": round(risk_score, 2)
    }

# --- ⑥ 可視化 (CLI強化) ---
def print_rich_analysis(player_id: int, data: Dict):
    risk_label = "LOW"
    if data['risk_score'] > 2: risk_label = "MEDIUM"
    if data['risk_score'] > 5: risk_label = "HIGH"
    
    print(f"\nPlayer {player_id}")
    print(f"  * ICM EV: {data['fold_ev']:.2f}")
    print(f"  * Push EV: {data['push_ev']:.2f} ({'+' if data['diff'] >= 0 else ''}{data['diff']:.2f})")
    print(f"  * Risk Score: {data['risk_score']:.2f} ({risk_label})")
    print(f"  * BF vs Villain: {data['bubble_factor']:.1f} (Required: {data['required_equity']*100:.1f}%)")
    print(f"  * Current Equity: {data['current_equity']*100:.1f}%")

if __name__ == "__main__":
    # 実行例
    s = [10000, 8000, 5000, 3000, 2000]
    p = [50, 30, 20]
    v_range = {"22+": 1.0, "A2s+": 1.0, "KJs+": 1.0} # 簡易表記
    
    print("=== 高度機能デモ ===")
    res = evaluate_specific_hand("AhKd", s, p, 2, 0, v_range, 150, 4)
    print_rich_analysis(3, res)
