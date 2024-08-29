from sqlalchemy import Table, Column, Text, MetaData

metadata = MetaData()

greetings = Table(
    'greetings', 
    metadata,
    Column('name', Text),
    Column('note', Text)
)