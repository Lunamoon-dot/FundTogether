import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import { DRIZZLE_DB } from './database.constants';
import * as schema from './schema';

export const databaseProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const pool = new Pool({
      connectionString: configService.getOrThrow<string>('databaseUrl'),
    });

    return drizzle(pool, { schema });
  },
};
