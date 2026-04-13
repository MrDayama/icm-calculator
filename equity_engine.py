import itertools
import functools
from typing import List, Dict, Set, Tuple

# Card ranks and suits
RANKS = '23456789TJQKA'
SUITS = 'cdhs'

class Card:
    def __init__(self, card_str: str):
        self.rank = card_str[0]
        self.suit = card_str[1]
        self.rank_idx = RANKS.find(self.rank)
        
    def __repr__(self):
        return f"{self.rank}{self.suit}"
    
    def __eq__(self, other):
        return self.rank == other.rank and self.suit == other.suit
    
    def __hash__(self):
        return hash((self.rank, self.suit))

class Hand:
    """Represents a specific 2-card hand like AhKh"""
    def __init__(self, c1: Card, c2: Card):
        # Sort to ensure unique representation
        if c1.rank_idx > c2.rank_idx:
            self.cards = (c1, c2)
        elif c1.rank_idx < c2.rank_idx:
            self.cards = (c2, c1)
        else:
            # Same rank, sort by suit
            if c1.suit > c2.suit:
                self.cards = (c1, c2)
            else:
                self.cards = (c2, c1)
                
    def get_str(self) -> str:
        return f"{self.cards[0]}{self.cards[1]}"

class Range:
    """Handles hand ranges and blockers"""
    def __init__(self, range_dict: Dict[str, float] = None):
        # range_dict: {"AA": 1.0, "AKs": 0.5, ...}
        self.raw_range = range_dict or {}
        self.combos = self._expand_range(self.raw_range)
        
    def _expand_range(self, range_dict: Dict[str, float]) -> Dict[str, float]:
        """Expands 169 notations into individual combos with weights"""
        expanded = {}
        # This is a simplified version, in a real pro tool we'd have all 1326 combos
        # For brevity in this script, we'll map 169 to 1326
        for hand_str, weight in range_dict.items():
            if len(hand_str) == 2: # Pair like "AA"
                r = hand_str[0]
                for s1, s2 in itertools.combinations(SUITS, 2):
                    combo = f"{r}{s1}{r}{s2}"
                    expanded[combo] = weight
            elif hand_str.endswith('s'): # Suited like "AKs"
                r1, r2 = hand_str[0], hand_str[1]
                for s in SUITS:
                    combo = f"{r1}{s}{r2}{s}"
                    expanded[combo] = weight
            elif hand_str.endswith('o'): # Offsuit like "AKo"
                r1, r2 = hand_str[0], hand_str[1]
                for s1 in SUITS:
                    for s2 in SUITS:
                        if s1 != s2:
                            combo = f"{r1}{s1}{r2}{s2}"
                            expanded[combo] = weight
        return expanded

    def get_available_combos(self, blocked_cards: Set[Card]) -> Dict[str, float]:
        """Returns combos that don't use any of the blocked cards"""
        available = {}
        for combo_str, weight in self.combos.items():
            c1 = Card(combo_str[0:2])
            c2 = Card(combo_str[2:4])
            if c1 not in blocked_cards and c2 not in blocked_cards:
                available[combo_str] = weight
        return available

def compute_win_rate_fast(hero_hand_str: str, villain_range: Range, board: List[str] = []) -> float:
    """
    Fast equity calculation using pre-computed heuristics + blocker adjustment.
    In a production tool, this would query a large LUT.
    """
    hero_cards = {Card(hero_hand_str[0:2]), Card(hero_hand_str[2:4])}
    available_villain = villain_range.get_available_combos(hero_cards)
    
    if not available_villain:
        return 0.5
    
    total_weight = 0
    total_win_share = 0
    
    # Simple heuristic win rate (can be replaced by a real LUT)
    for v_combo, weight in available_villain.items():
        win_rate = _get_head_to_head_equity(hero_hand_str, v_combo)
        total_win_share += win_rate * weight
        total_weight += weight
        
    return total_win_share / total_weight if total_weight > 0 else 0.5

@functools.lru_cache(maxsize=1024)
def _get_head_to_head_equity(h1_str: str, h2_str: str) -> float:
    """
    Simplified H2H equity logic.
    Actual implementation would use an Exact LUT.
    """
    # Placeholder: Simple rank comparison + suited bonus
    r1, r2 = h1_str[0], h1_str[2]
    v1, v2 = RANKS.find(r1), RANKS.find(r2)
    ev1 = v1 * 2 + v2
    
    or1, or2 = h2_str[0], h2_str[2]
    ov1, ov2 = RANKS.find(or1), RANKS.find(or2)
    ev2 = ov1 * 2 + ov2
    
    if ev1 > ev2: return 0.65
    if ev1 < ev2: return 0.35
    return 0.5

def compute_multiway_equity(hero_hand_str: str, villain_ranges: List[Range], mode: str = "fast") -> List[float]:
    """
    ③ マルチウェイ対応強化
    hero_hand_str: 'AhKd'
    villain_ranges: [Range1, Range2, ...]
    """
    # Blocker: Hero cards removal
    blocked = {Card(hero_hand_str[0:2]), Card(hero_hand_str[2:4])}
    
    # Simple multi-way approximation: (WinProb = Product of H2H Wins)
    # Note: This is an approximation. In 'accurate' mode, we'd use Monte Carlo.
    win_rates = []
    for v_range in villain_ranges:
        win_rates.append(compute_win_rate_fast(hero_hand_str, v_range))
    
    # Hero wins only if they beat EVERYone (Independent Events approximation)
    hero_win = 1.0
    for wr in win_rates:
        hero_win *= wr
        
    return [hero_win] + [(1.0 - hero_win) / len(villain_ranges)] * len(villain_ranges)

class EquityCache:
    """⑦ キャッシュ最適化"""
    def __init__(self):
        self.cache = {}

    def get_result(self, key):
        return self.cache.get(key)

    def set_result(self, key, value):
        self.cache[key] = value

GLOBAL_CACHE = EquityCache()
