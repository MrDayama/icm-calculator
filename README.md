# ICM Calculator Pro - Advanced Analysis Edition

ポーカートーナメントにおける賞金期待値（ICM）を、プロレベルの精度で分析するための強力なツールキットです。

## 🌟 主な機能 (v1.1.0)
- **レンジベース意思決定**: 1326コンボによる精密な期待値計算。
- **Blocker効果 (カード除去)**: 自分のハンドが相手のレンジに与える影響を自動考慮。
- **マルチウェイ対応**: 複数プレイヤー間の衝突時の勝率近似。
- **次BBリスクスコア**: 直近の強制ベットによる圧迫を数値化。
- **特定ハンド評価モード**: 特定のハンド（例: AhKd）に対する即時分析。
- **高度なWeb UI**: ダークモード対応の美しいインターフェース。

## 📁 リポジトリ構成とブランチ
- `main`: 安定版。
- `feature/advanced-analysis`: 今回追加された高度分析機能が実装されている最新ブランチ。

## 🛠 使い方

### Web インターフェース
`web/index.html` をブラウザで開くだけで、即座に分析を開始できます。

### Python CLI (高度分析モード)
```bash
python cli_advanced.py --hand AhKd --stacks 10000 5000 2000 --payouts 50 30 --hero 2
```

## 📖 ドキュメント
- [ユーザーマニュアル (USER_MANUAL.md)](USER_MANUAL.md): 指標の定義と操作方法。
- [技術仕様書 (SPECIFICATIONS.md)](SPECIFICATIONS.md): 内部アルゴリズムと設計詳細。

## 📝 開発環境
- Python 3.12+
- WSL / Linux 環境推奨 (venv作成用)
