import sys
import json
import functools
from typing import List, Dict

def calculate_icm(stacks: List[float], payouts: List[float]) -> List[float]:
    """
    Independent Chip Model (ICM) calculator using recursive algorithm with memoization.
    
    Args:
        stacks: List of chip stacks for each player.
        payouts: List of prizes from 1st place downwards.
        
    Returns:
        List of EV for each player in the same order as stacks.
    """
    n = len(stacks)
    m = len(payouts)
    
    # Ensure stacks is list of floats and payouts is padded if shorter than stacks
    stacks = [float(s) for s in stacks]
    full_payouts = [float(p) for p in payouts] + [0.0] * (n - m)
    
    total_chips = sum(stacks)
    if total_chips <= 0:
        # Avoid division by zero if all stacks are 0
        return [0.0] * n

    # Memoization cache: subset of player indices -> list of EVs for those players
    # We use frozenset of indices as key.
    # Note: The sum of EVs for a subset will equal the sum of remaining payouts.
    @functools.lru_cache(maxsize=None)
    def compute_evs(player_indices: frozenset, payout_idx: int) -> Dict[int, float]:
        num_players = len(player_indices)
        
        # Base cases
        if num_players == 0:
            return {}
        
        # If no more prize money or 1 player left
        if payout_idx >= n:
            return {idx: 0.0 for idx in player_indices}
            
        if num_players == 1:
            idx = next(iter(player_indices))
            # The last player gets the sum of all remaining prizes
            # In standard ICM, we usually assume len(payouts) <= len(stacks).
            # But just in case, we sum what's left.
            remaining_prize_sum = sum(full_payouts[payout_idx:])
            return {idx: remaining_prize_sum}

        # Recursive calculation
        current_evs = {idx: 0.0 for idx in player_indices}
        
        # Current subset total chips
        subset_total_chips = sum(stacks[idx] for idx in player_indices)
        
        if subset_total_chips == 0:
            # If all remaining players have 0 chips, split remaining prizes equally
            remaining_prize_sum = sum(full_payouts[payout_idx:])
            share = remaining_prize_sum / num_players
            return {idx: share for idx in player_indices}

        current_prize = full_payouts[payout_idx]
        
        for p in player_indices:
            # Probability of player p winning the CURRENT prize among the current subset
            prob = stacks[p] / subset_total_chips
            
            # Recurse for the remaining players for the remaining payouts
            remaining_players = player_indices - {p}
            sub_results = compute_evs(remaining_players, payout_idx + 1)
            
            # Add p's win share
            current_evs[p] += prob * current_prize
            
            # Add p's contribution to others' EVs
            for q, ev_q in sub_results.items():
                current_evs[q] += prob * ev_q
                
        return current_evs

    # Initial call with all players and starting payout index 0
    all_indices = frozenset(range(n))
    result_dict = compute_evs(all_indices, 0)
    
    # Return as list in the original order
    return [result_dict[i] for i in range(n)]

def compute_bubble_factor(stacks: List[float], payouts: List[float], hero_index: int, villain_index: int) -> float:
    """
    Calculate the Bubble Factor (BF) for Hero vs Villain.
    BF = (EV_now - EV_lose) / (EV_win - EV_now)
    """
    if hero_index == villain_index:
        return 1.0
    
    # Current EV
    ev_results_now = calculate_icm(stacks, payouts)
    ev_now = ev_results_now[hero_index]
    
    # Total risk is the smaller stack
    risk = min(stacks[hero_index], stacks[villain_index])
    
    # Win scenario: Hero wins the risk amount from Villain
    new_stacks_win = list(stacks)
    new_stacks_win[hero_index] += risk
    new_stacks_win[villain_index] -= risk
    ev_win = calculate_icm(new_stacks_win, payouts)[hero_index]
    
    # Lose scenario: Hero loses the risk amount to Villain
    new_stacks_lose = list(stacks)
    new_stacks_lose[hero_index] -= risk
    new_stacks_lose[villain_index] += risk
    ev_lose = calculate_icm(new_stacks_lose, payouts)[hero_index]
    
    # BF Calculation
    numerator = ev_now - ev_lose
    denominator = ev_win - ev_now
    
    if denominator <= 0:
        return 99.0  # Represents near-infinite risk premium (e.g., when winning doesn't improve rank but losing busts)
        
    return numerator / denominator

def main():
    """CLI wrapper for ICM calculator"""
    import argparse
    
    parser = argparse.ArgumentParser(description="ICM (Independent Chip Model) Calculator")
    parser.add_argument("--stacks", "-s", type=float, nargs="+", help="Player stacks separated by space")
    parser.add_argument("--payouts", "-p", type=float, nargs="+", help="Prizes separated by space (1st, 2nd, ...)")
    parser.add_argument("--json", "-j", type=str, help="JSON file containing stacks and payouts")
    parser.add_argument("--format", "-f", action="store_true", help="Print formatted results")
    
    args = parser.parse_args()
    
    stacks = []
    payouts = []
    
    if args.json:
        try:
            with open(args.json, 'r') as f:
                data = json.load(f)
                stacks = data.get("stacks", [])
                payouts = data.get("payouts", [])
        except Exception as e:
            print(f"Error reading JSON: {e}")
            sys.exit(1)
    elif args.stacks and args.payouts:
        stacks = args.stacks
        payouts = args.payouts
    else:
        # Default or interactive mode? Let's just show help or ask if nothing provided
        if not args.stacks:
            print("Please provide --stacks and --payouts, or --json")
            parser.print_help()
            sys.exit(1)

    if not stacks or not payouts:
        print("Error: Stacks and payouts are required.")
        sys.exit(1)
        
    if len(payouts) > len(stacks):
        print("Warning: More payouts than players. Extra payouts will be ignored.")
        payouts = payouts[:len(stacks)]

    evs = calculate_icm(stacks, payouts)
    
    if args.format:
        print("\n=== ICM Calculation Results ===")
        print(f"{'Player':<10} | {'Stack':<12} | {'EV':<12} | {'Avg BF':<8}")
        print("-" * 60)
        
        # Calculate BFs for all pairs to compute Average BF
        all_bfs = []
        for i in range(len(stacks)):
            player_bfs = []
            for j in range(len(stacks)):
                if i != j and stacks[i] > 0 and stacks[j] > 0:
                    bf = compute_bubble_factor(stacks, payouts, i, j)
                    player_bfs.append(bf)
            avg_bf = sum(player_bfs) / len(player_bfs) if player_bfs else 1.0
            all_bfs.append(avg_bf)

        for i, (s, ev, abf) in enumerate(zip(stacks, evs, all_bfs)):
            re_pct = (abf / (1 + abf)) * 100
            print(f"Player {i+1:<3} | {s:<12.2f} | {ev:<12.4f} | {abf:<8.2f} (RE: {re_pct:.1f}%)")
        
        total_ev = sum(evs)
        total_payout = sum(payouts)
        print("-" * 60)
        print(f"{'Total':<10} | {'':<12} | {total_ev:<12.4f}")
        print(f"Prize Pool: {total_payout:.4f}")
    else:
        # Include BFs in JSON output if possible, otherwise keep original
        result = {
            "evs": evs,
            "avg_bfs": [sum([compute_bubble_factor(stacks, payouts, i, j) for j in range(len(stacks)) if i != j]) / (len(stacks)-1) for i in range(len(stacks))]
        }
        print(json.dumps(result))

if __name__ == "__main__":
    main()
