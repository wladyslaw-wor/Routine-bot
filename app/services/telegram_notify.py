import json
import logging
from decimal import Decimal
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_message(chat_id: int, text: str) -> None:
    if not settings.bot_token:
        return
    url = f'https://api.telegram.org/bot{settings.bot_token}/sendMessage'
    payload = urlencode({'chat_id': chat_id, 'text': text}).encode('utf-8')
    request = Request(url, data=payload, method='POST')
    request.add_header('Content-Type', 'application/x-www-form-urlencoded')
    try:
        with urlopen(request, timeout=6) as response:
            raw = response.read().decode('utf-8')
            data = json.loads(raw)
            if not data.get('ok'):
                logger.warning('Telegram sendMessage failed: %s', raw)
    except Exception as exc:
        logger.warning('Telegram notification failed: %s', exc)


def _close_text(period: str, session_id: int, done: int, canceled: int, failed: int, amount: Decimal, currency: str) -> str:
    return (
        f'{period} closed (#{session_id}).\n'
        f'Done: {done}\n'
        f'Canceled: {canceled}\n'
        f'Failed: {failed}\n'
        f'To transfer: {amount} {currency}'
    )


def notify_day_closed(chat_id: int, session_id: int, summary: dict, currency: str) -> None:
    text = _close_text(
        period='Day',
        session_id=session_id,
        done=summary['done_count'],
        canceled=summary['canceled_count'],
        failed=summary['failed_count'],
        amount=summary['total_penalty'],
        currency=currency,
    )
    _send_message(chat_id, text)


def notify_week_closed(chat_id: int, session_id: int, summary: dict, currency: str, auto: bool = False) -> None:
    title = 'Week (auto)'
    if not auto:
        title = 'Week'
    text = _close_text(
        period=title,
        session_id=session_id,
        done=summary['done_count'],
        canceled=summary['canceled_count'],
        failed=summary['failed_count'],
        amount=summary['total_penalty'],
        currency=currency,
    )
    _send_message(chat_id, text)
