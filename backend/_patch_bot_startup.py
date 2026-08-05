from pathlib import Path

path = Path('bot.py')
text = path.read_text()
old = '    app.add_handler(\n        MessageHandler(filters.TEXT | filters.LOCATION | filters.VENUE, handle_message)\n    )\n\n    app.run_polling()\n'
new = '    app.add_handler(\n        MessageHandler(filters.TEXT | filters.LOCATION | filters.VENUE, handle_message)\n    )\n\n    global APPLICATION, notification_bot\n    APPLICATION = app\n    notification_bot = Bot(token=BOT_TOKEN)\n    start_realtime_thread()\n\n    app.run_polling()\n'
if old not in text:
    raise RuntimeError('OLD_BLOCK_NOT_FOUND')
path.write_text(text.replace(old, new, 1))
print('patched')
