from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TaskKind(str, Enum):
    daily = 'daily'
    weekly = 'weekly'
    backlog = 'backlog'


class InstanceStatus(str, Enum):
    planned = 'planned'
    done = 'done'
    canceled = 'canceled'
    failed = 'failed'


class TelegramUser(Base):
    __tablename__ = 'telegram_users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    telegram_user_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    settings: Mapped['UserSettings'] = relationship(back_populates='user', uselist=False, cascade='all, delete-orphan')
    tasks: Mapped[list['Task']] = relationship(back_populates='user', cascade='all, delete-orphan')


class UserSettings(Base):
    __tablename__ = 'user_settings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('telegram_users.id'), unique=True, index=True)
    currency: Mapped[str] = mapped_column(String(8), default='EUR')
    penalty_daily_default: Mapped[float] = mapped_column(Numeric(10, 2), default=10)
    penalty_weekly_default: Mapped[float] = mapped_column(Numeric(10, 2), default=20)

    user: Mapped['TelegramUser'] = relationship(back_populates='settings')


class Task(Base):
    __tablename__ = 'tasks'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('telegram_users.id'), index=True)
    title: Mapped[str] = mapped_column(String(255))
    kind: Mapped[TaskKind] = mapped_column(SqlEnum(TaskKind), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    penalty_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped['TelegramUser'] = relationship(back_populates='tasks')
    instances: Mapped[list['Instance']] = relationship(back_populates='task', cascade='all, delete-orphan')


class WeekSession(Base):
    __tablename__ = 'week_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('telegram_users.id'), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DaySession(Base):
    __tablename__ = 'day_sessions'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('telegram_users.id'), index=True)
    week_session_id: Mapped[int | None] = mapped_column(ForeignKey('week_sessions.id'), nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Instance(Base):
    __tablename__ = 'instances'
    __table_args__ = (
        UniqueConstraint('task_id', 'day_session_id', name='uq_task_day_session'),
        UniqueConstraint('task_id', 'week_session_id', name='uq_task_week_session'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('telegram_users.id'), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), index=True)
    status: Mapped[InstanceStatus] = mapped_column(SqlEnum(InstanceStatus), default=InstanceStatus.planned, index=True)
    penalty_applied: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    day_session_id: Mapped[int | None] = mapped_column(ForeignKey('day_sessions.id'), nullable=True, index=True)
    week_session_id: Mapped[int | None] = mapped_column(ForeignKey('week_sessions.id'), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task: Mapped['Task'] = relationship(back_populates='instances')
