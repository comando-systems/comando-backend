import { loadConfig } from '@/app/config';
import { createAuth } from '.';

export const auth = createAuth(loadConfig()).auth;
