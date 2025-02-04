from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import Mapped
from sqlalchemy.orm import mapped_column

# Let's declare a class for accessing the database table.
class Base(DeclarativeBase):
    pass

class Hello(Base):
    __tablename__ = "dbos_hello"
    greet_count: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(nullable=False)

    def __repr__(self):
        return f"Hello(greet_count={self.greet_count!r}, name={self.name!r})"

