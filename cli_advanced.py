import sys
import argparse
from poker_analyzer import evaluate_specific_hand, print_rich_analysis

def main():
    parser = argparse.ArgumentParser(description="Advanced ICM Analyzer CLI")
    parser.add_argument("--hand", required=True, help="Hero hand (e.g., AhKd)")
    parser.add_argument("--stacks", type=float, nargs="+", required=True, help="Stacks for all players")
    parser.add_argument("--payouts", type=float, nargs="+", required=True, help="Prize structure")
    parser.add_argument("--hero", type=int, default=0, help="Hero index (0-based)")
    parser.add_argument("--villain", type=int, default=1, help="Villain index (0-based)")
    parser.add_argument("--orb_left", type=int, default=1, help="Hands left until Hero is BB")
    parser.add_argument("--blinds", type=float, default=150.0, help="Total blinds per hand (SB+BB+Ante)")

    args = parser.parse_args()

    # 簡易レンジ（デフォルト：10%タイトレンジ）
    default_v_range = {"10%": 1.0} 

    print("--- Advanced ICM Analysis Running ---")
    try:
        res = evaluate_specific_hand(
            args.hand, 
            args.stacks, 
            args.payouts, 
            args.hero, 
            args.villain, 
            default_v_range, 
            args.blinds, 
            args.orb_left
        )
        print_rich_analysis(args.hero + 1, res)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
