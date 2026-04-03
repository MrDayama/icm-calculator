from icm_tool import calculate_icm
import math

def test_case_1():
    print("Test Case 1 (Equal Stacks):")
    stacks = [10.0, 10.0, 10.0]
    payouts = [50.0, 30.0, 20.0]
    evs = calculate_icm(stacks, payouts)
    print(f"Stacks: {stacks}")
    print(f"Payouts: {payouts}")
    print(f"EVs: {evs}")
    
    # All EVs should be 33.3333
    expected = sum(payouts) / len(stacks)
    for i, ev in enumerate(evs):
        assert math.isclose(ev, expected, rel_tol=1e-5), f"Player {i} EV mismatch"
    print("Passed!")

def test_case_2():
    print("\nTest Case 2 (Unequal Stacks):")
    stacks = [50.0, 30.0, 20.0]
    payouts = [50.0, 30.0, 20.0]
    evs = calculate_icm(stacks, payouts)
    print(f"Stacks: {stacks}")
    print(f"Payouts: {payouts}")
    print(f"EVs: {evs}")
    
    # In ICM, larger stacks have slightly lower EV relative to their stack size than smaller stacks 
    # (assuming prize structure is positive)
    # Wait, it depends. But usually ICM rewards small stacks more than their raw chip count relative to the top prizes.
    # Total prize = 100. Stack total = 100.
    # Player 1 (50 chips): 1st prob = 0.5. 
    #   If 1st: gets 50.
    #   If 2nd/3rd: ...
    
    # Check total EV matches prize pool
    assert math.isclose(sum(evs), sum(payouts), rel_tol=1e-7)
    
    # Result check (indicative):
    # Player 1 tends to have EV lower than 50 in many prize structures where 2nd/3rd are closer to 1st.
    # Here, 50, 30, 20.
    # Let's see.
    print("Test finished and sum validated.")

def main():
    test_case_1()
    test_case_2()

if __name__ == "__main__":
    main()
