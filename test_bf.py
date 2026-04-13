import icm_tool
try:
    s = [50.0, 30.0, 20.0]
    p = [70.0, 30.0]
    evs = icm_tool.calculate_icm(s, p)
    print(f"EVs: {evs}")
    bf = icm_tool.compute_bubble_factor(s, p, 1, 0)
    print(f"BF Player 2 vs Player 1: {bf}")
except Exception as e:
    import traceback
    traceback.print_exc()
