from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    bot_token: str
    mini_app_url: str = 'http://localhost:8000'
    database_url: str = 'sqlite:///./routine.db'
    app_host: str = '0.0.0.0'
    app_port: int = 8000
    debug_allow_fake_auth: bool = True


settings = Settings()
