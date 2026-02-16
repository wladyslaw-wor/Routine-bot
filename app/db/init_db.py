from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
import app.models.models  # noqa: F401


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        task_columns = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info('tasks')").fetchall()]
        if 'order_index' not in task_columns:
            conn.execute(text('ALTER TABLE tasks ADD COLUMN order_index INTEGER DEFAULT 0'))


if __name__ == '__main__':
    init_db()
    print('Database initialized')
