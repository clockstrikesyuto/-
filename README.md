# DINO DASH RACE

スマホ/PCで遊べる横スクロール恐竜レース。

- 1人: ENDLESS（自己ベスト）
- 2〜4人: 1〜5レース、総距離勝負
- 同じシードの障害物で公平に対戦
- 近い相手は同じ画面に表示、遠い相手は画面端の距離差で表示
- 最終レース直前の総距離は `???m`
- リザルトは横棒が伸びるアニメーション

## Local

```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

Open http://127.0.0.1:8000
