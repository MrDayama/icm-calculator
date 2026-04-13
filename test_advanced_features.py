import pytest
from equity_engine import Range, Card, compute_win_rate_fast, compute_multiway_equity
from poker_analyzer import calculate_risk_score, evaluate_specific_hand

def test_blocker_effect():
    """② カード除去（Blocker効果）の検証"""
    v_range_dict = {"AA": 1.0, "KK": 1.0, "AKs": 1.0}
    v_range = Range(v_range_dict)
    
    # AhKh を Hero が持っている場合、Villain の AKs コンボは大幅に減るはず
    # また AA, KK のコンボも減る
    hero_hand = "AhKh"
    eq_with_blocker = compute_win_rate_fast(hero_hand, v_range)
    
    # Blockerなし（仮想的に遠くのカードを指定）
    hero_hand_no_block = "2c3d"
    eq_no_blocker = compute_win_rate_fast(hero_hand_no_block, v_range)
    
    # Blockerがあると、Villainの強いハンドが減るため、HeroのEquityは変わるはず
    assert eq_with_blocker != eq_no_blocker
    print(f"Equity with blocker: {eq_with_blocker}, without: {eq_no_blocker}")

def test_risk_score():
    """⑤ 次BBリスクスコアの検証"""
    # stack=1000, blind=100, orbit_left=4 hands
    # stack_ratio = 10, risk = 4 / 10 = 0.4
    score = calculate_risk_score(1000, 100, 4)
    assert score == pytest.approx(0.4)
    
    # スタックが短いほどリスクスコアは高くなる
    high_risk = calculate_risk_score(200, 100, 1) # 1 / 2 = 0.5
    low_risk = calculate_risk_score(5000, 100, 1) # 1 / 50 = 0.02
    assert high_risk > low_risk

def test_multiway_sum():
    """③ マルチウェイ対応（合計1.0の検証）"""
    h = "AsKs"
    v_ranges = [Range({"QQ": 1.0}), Range({"JJ": 1.0})]
    equities = compute_multiway_equity(h, v_ranges)
    
    assert len(equities) == 3 # Hero + 2 Villains
    assert sum(equities) == pytest.approx(1.0)

def test_specific_hand_mode():
    """④ ハンド単位評価モードの出力整合性"""
    s = [10000, 8000, 5000, 3000, 2000]
    p = [50, 30, 20]
    v_range = {"AA": 1.0}
    res = evaluate_specific_hand("AhKd", s, p, 2, 0, v_range, 150, 4)
    
    assert "push_ev" in res
    assert "fold_ev" in res
    assert "risk_score" in res
    assert "bubble_factor" in res
    assert res["hand"] == "AhKd"

if __name__ == "__main__":
    # 手動実行用
    test_blocker_effect()
    test_risk_score()
    test_multiway_sum()
    print("All advanced tests passed!")
