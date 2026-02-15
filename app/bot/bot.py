import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup, WebAppInfo

from app.core.config import settings

logging.basicConfig(level=logging.INFO)

bot = Bot(token=settings.bot_token)
dp = Dispatcher()


@dp.message(CommandStart())
async def start_handler(message: Message) -> None:
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text='Open Routine App', web_app=WebAppInfo(url=settings.mini_app_url))]],
        resize_keyboard=True,
    )
    await message.answer('Open Mini App to manage days, weeks and tasks.', reply_markup=keyboard)


async def main() -> None:
    await dp.start_polling(bot)


if __name__ == '__main__':
    asyncio.run(main())
