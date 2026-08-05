"""One-off: inspect async realtime client channel API for debugging.
Run interactively when debugging realtime connection behavior.
"""
import asyncio
import inspect
from supabase._async.client import create_client

async def main():
    client = await create_client('https://example.supabase.co', 'test')
    ch = client.channel('test')
    print('channel type', type(ch))
    print('members', [n for n in dir(ch) if not n.startswith('_')])
    if hasattr(ch, 'on'):
        print('on signature', inspect.signature(ch.on))
    await client.close()

asyncio.run(main())
