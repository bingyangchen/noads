先使用 `git push -u origin <branch_name>` 將現在這個分支推送到遠端。

然後使用 `gh pr create --base <base> --title <title> --body <body> --assignee @me` 來建立一個 PR。

其中：

- `<base>` 是 `main` 分支。
- `<title>` 需要請你看目前這個分支與 `<base>` 分支的差異，並且寫出一段簡短（少於 50 字）的描述。
- `<body>` 需要請你看目前這個分支與 `<base>` 分支的差異，並且以 Markdown 格式寫出一段簡短的描述。

其它注意事項：

- `<body>` 請直接寫在 `--body` 的參數裡，不要用 `--body-file`、暫存檔，也不要用 heredoc（`<<EOF` ... `EOF` 這類寫法）。若要分段換行，在一般雙引號 `"..."` 裡直接換行（多行字串，仍屬同一個引號區塊）因為在一般 `"..."` 裡寫 `\n` 不會變成換行，只會得到字面上的反斜線與 `n`。
- 不要理會沒有 commit 進 repository 的變更（也不要 revert 這些變更）。
- `<title>` 與 `<body>` 需以英文撰寫。
- 做完這些事後，在最後提供我 PR 的網址。

如果你不清楚 `gh` 的使用方式的話，請使用 skill: `~/.cursor/skills/gh-create-pr/SKILL.md`。
