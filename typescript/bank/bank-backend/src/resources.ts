import { DBOSKoa } from '@dbos-inc/koa-serve';
import { PrismaDataSource } from '@dbos-inc/prisma-datasource';
import { PrismaClient } from '@prisma/client';

export const dkoa = new DBOSKoa();

process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ||
  `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || 'dbos'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || '5432'}/${process.env.PGDATABASE || 'bank_backend'}`;

export const prismaClient = new PrismaClient();

export const prisma = new PrismaDataSource<PrismaClient>('app-db', prismaClient);
