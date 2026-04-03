import functools
import json
from typing import List, Dict

# --- 1. デッキとハンドの定義 ---
RANKS = '23456789TJQKA'
RANK_VALUE = {r: i for i, r in enumerate(RANKS)}

def get_169_hands() -> List[str]:
    """169種類のハンド（AA, AKs, AKo等）を生成"""
    hands = []
    # Pairs (Strongest first)
    for r in reversed(RANKS):
        hands.append(r + r)
    # Suited
    for i in range(len(RANKS) - 1, 0, -1):
        for j in range(i - 1, -1, -1):
            hands.append(RANKS[i] + RANKS[j] + 's')
    # Offsuit
    for i in range(len(RANKS) - 1, 0, -1):
        for j in range(i - 1, -1, -1):
            hands.append(RANKS[i] + RANKS[j] + 'o')
    return hands

# --- 2. ICM計算エンジン ---
def calculate_icm(stacks: List[float], payouts: List[float]) -> List[float]:
    n = len(stacks)
    m = len(payouts)
    full_payouts = [float(p) for p in payouts] + [0.0] * (max(0, n - m))
    
    @functools.lru_cache(maxsize=None)
    def compute_evs(player_indices: frozenset, payout_idx: int) -> Dict[int, float]:
        num_players = len(player_indices)
        if num_players == 0 or payout_idx >= n:
            return {idx: 0.0 for idx in player_indices}
        if num_players == 1:
            idx = next(iter(player_indices))
            return {idx: sum(full_payouts[payout_idx:])}
        
        subset_total = sum(stacks[idx] for idx in player_indices)
        evs = {idx: 0.0 for idx in player_indices}
        if subset_total == 0:
            share = sum(full_payouts[payout_idx:]) / num_players
            return {idx: share for idx in player_indices}
            
        current_prize = full_payouts[payout_idx]
        for p in player_indices:
            prob = stacks[p] / subset_total
            remaining = player_indices - {p}
            sub_res = compute_evs(remaining, payout_idx + 1)
            evs[p] += prob * current_prize
            for q, ev_q in sub_res.items():
                evs[q] += prob * ev_q
        return evs

    res = compute_evs(frozenset(range(n)), 0)
    return [res[i] for i in range(n)]

# --- 3. 勝率ロジック (vs Range) ---
def get_equity_vs_range(hand: str, villain_range_pct: float) -> float:
    """
    ハンドの、相手のプッシュレンジ(上位X%)に対する概算勝率を計算。
    (ポーカーエンジニアとしての経験に基づく近似モデル)
    """
    r1, r2 = hand[0], hand[1]
    v1, v2 = RANK_VALUE[r1], RANK_VALUE[r2]
    is_pair = (r1 == r2)
    is_suited = hand.endswith('s')
    
    # Base Power (Relative to random)
    if is_pair:
        power = 0.5 + (v1 / 12.0) * 0.35 # 22: ~50%, AA: ~85%
    else:
        # High card weight
        power = 0.3 + (v1 / 12.0) * 0.2 + (v2 / 12.0) * 0.1
        if is_suited: power += 0.04
        
    # Range Adjustment
    # Villainのレンジが狭い（タイト）ほど、Heroの勝率は低くなる
    # 30%レンジに対して、ランダムレンジ比で約5-10%以上勝率が低下する
    tightness = 1.0 - villain_range_pct
    equity = power - (tightness * 0.22)
    
    return max(0.1, min(0.9, equity))

# --- 4. メイン分析関数 ---
def analyze_call_range(stacks: List[int], payouts: List[int], hero_idx: int, villain_idx: int, villain_range_pct: float):
    # 1. Fold EV
    ev_fold = calculate_icm([float(s) for s in stacks], payouts)[hero_idx]
    
    # 2. Win EV
    win_amount = min(stacks[hero_idx], stacks[villain_idx])
    win_stacks = list(stacks)
    win_stacks[hero_idx] += win_amount
    win_stacks[villain_idx] -= win_amount
    ev_win = calculate_icm([float(s) for s in win_stacks], payouts)[hero_idx]
    
    # 3. Lose EV
    lose_stacks = list(stacks)
    lose_stacks[hero_idx] -= win_amount
    lose_stacks[villain_idx] += win_amount
    ev_lose = calculate_icm([float(s) for s in lose_stacks], payouts)[hero_idx]
    
    # Required Equity
    denom = (ev_win - ev_lose)
    p_req = (ev_fold - ev_lose) / denom if denom != 0 else 1.0
    
    # Range Selection
    all_hands = get_169_hands()
    call_range = [h for h in all_hands if get_equity_vs_range(h, villain_range_pct) >= p_req]
    
    return {
        "required_equity": p_req,
        "call_range": call_range,
        "evs": {"fold": ev_fold, "win": ev_win, "lose": ev_lose}
    }

def draw_heatmap(call_range: List[str]):
    print("\n   " + " ".join(RANKS[::-1]))
    for i, r1 in enumerate(RANKS[::-1]):
        row = f"{r1} "
        for j, r2 in enumerate(RANKS[::-1]):
            if i == j: hand = r1 + r1
            elif i < j: hand = r1 + r2 + 's'
            else: hand = r2 + r1 + 'o'
            row += " X" if hand in call_range else " ."
        print(row)

if __name__ == "__main__":
    # サンプル実行
    s = [10000, 8000, 5000, 3000, 2000]
    p = [50, 30, 20]
    res = analyze_call_range(s, p, 2, 4, 0.3)
    print(f"Required Equity: {res['required_equity']*100:.1f}%")
    draw_heatmap(res['call_range'])
