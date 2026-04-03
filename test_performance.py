import time
from icm_tool import calculate_icm

def test_10_players():
    print("Testing 10 players performance...")
    stacks = [1000, 800, 500, 400, 300, 250, 200, 150, 100, 50]
    payouts = [100, 60, 40, 20, 10]
    
    start = time.time()
    evs = calculate_icm(stacks, payouts)
    end = time.time()
    
    print(f"EVs: {[round(e, 2) for e in evs]}")
    print(f"Time taken: {end - start:.4f} seconds")
    
    assert len(evs) == 10
    assert abs(sum(evs) - sum(payouts)) < 1e-6

if __name__ == "__main__":
    test_10_players()
