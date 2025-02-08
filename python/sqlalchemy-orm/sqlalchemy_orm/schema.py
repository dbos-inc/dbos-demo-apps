from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

# This base class will be used to generate migrations.
# See migrations/env.py for more details.
class Base(DeclarativeBase):
    pass

# Let's declare a SQLAlchemy ORM class for accessing the database table.
class Hello(Base):
    __tablename__ = "dbos_hello"
    greet_count: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(nullable=False)

    def __repr__(self):
        return f"Hello(greet_count={self.greet_count!r}, name={self.name!r})"

