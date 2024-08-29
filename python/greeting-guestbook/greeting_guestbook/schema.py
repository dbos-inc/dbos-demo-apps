from sqlalchemy import Column, MetaData, Table, Text

metadata = MetaData()

greetings = Table("greetings", metadata, Column("name", Text), Column("note", Text))
