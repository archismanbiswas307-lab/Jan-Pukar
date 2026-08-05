import asyncio
import inspect
from supabase._async.client import create_client

async def main():
    c = await create_client('https://hjojcxwjtwwxclpcyzne.supabase.co', 'test')
    ch = c.channel('test')
    print('on_postgres_changes sig:', inspect.signature(ch.on_postgres_changes))
    print('subscribe sig:', inspect.signature(ch.subscribe))
    print('has on_postgres_changes', callable(getattr(ch, 'on_postgres_changes', None)))
    print('has subscribe', callable(getattr(ch, 'subscribe', None)))
    if hasattr(c, 'realtime') and hasattr(c.realtime, 'disconnect'):
        await c.realtime.disconnect()

asyncio.run(main())
