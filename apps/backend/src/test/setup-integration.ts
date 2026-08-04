/**
 * Points the application's lazy `getDb()` at the test database before any
 * module reaches for a connection — the pool is cached on first access, so
 * this cannot be done per test.
 */
import { useTestDatabase } from "./database.js";

useTestDatabase();
