import { DBOSKoa } from '@dbos-inc/koa-serve';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { PrismaClient } from '@prisma/client';

export const dkoa = new DBOSKoa();

const config = { user: process.env.PGUSER || 'postgres', database: 'bank_backend' };

process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ||
  `postgresql://${config.user}:${process.env['PGPASSWORD'] || 'dbos'}@${process.env['PGHOST'] || 'localhost'}:${process.env['PGPORT'] || '5432'}/${config.database}`;

export const prismaClient = new PrismaClient();

export const prisma = new PrismaDataSource<PrismaClient>('app-db', prismaClient);
