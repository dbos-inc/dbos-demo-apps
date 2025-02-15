# Welcome to DBOS File Manager
DBOS Task Scheduler is a full-stack app built with [React](https://react.dev/) [Express](https://expressjs.com/) and [DBOS](https://dbos.dev).  It serves as both a demo for learning DBOS concepts and a template for building your own DBOS-powered React applications.

The files in DBOS File Manager are stored in S3, but instead of relying on S3 for the file list, the files are kept in a database table.  This allows more flexible queries, and prevents expensive list calls to the S3 service.

DBOS Workflows are used to keep the files table in sync with the S3 contents.
