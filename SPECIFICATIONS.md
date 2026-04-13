# ICM Calculator 技術仕様書

## 1. モジュール構成

| ファイル | 役割 |
| :--- | :--- |
| `icm_tool.py` | ICM (Independent Chip Model) のコア計算。再帰とメモ化による高速化。 |
| `equity_engine.py` | レンジ展開 (1326 combos)、Blocker除去、マルチウェイ Equity 計算。 |
| `poker_analyzer.py` | ICMとEquityの統合、リスクスコア計算、特定ハンド評価。 |
| `cli_advanced.py` | ユーザー向け高度分析インターフェース。 |

## 2. 実装アルゴリズム

### ICM 計算
- **Method**: Malmuth-Harville アルゴリズム。
- **Optimization**: `functools.lru_cache` による重複計算の排除。
- **Complexity**: `O(N * 2^N)` (N: プレイヤー数)。最大10名程度まで実用速度。

### Equity 計算
- **Range Extension**: 169通りの入力を 1326通りのスート付きコンボに拡張。
- **Blocker Algorithm**:
  ```python
  if c1 not in blocked_cards and c2 not in blocked_cards:
      available_combos.append(combo)
  ```
- **Multiway Approximation**: 独立イベント近似による勝率推定。
  `Equity_Hero = Equity(H vs V1) * Equity(H vs V2) * ...`

### リスクスコア (Risk Score)
- **Formula**: `R = OrbitLeft / (Stack / TotalBlinds)`
- **Purpose**: FGS（Future Game Simulations）の計算負荷を抑えつつ、直近のブラインド圧迫を考慮に入れるための近似指標。

## 3. キャッシュ戦略

1.  **Level 1**: `icm_tool.py` の順位確率計算のメモ化。
2.  **Level 2**: `equity_engine.py` のハンド対ハンド Equity のキャッシュ。
3.  **Level 3**: シナリオ全体の状態キャッシュ。
