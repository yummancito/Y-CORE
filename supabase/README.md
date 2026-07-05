# Supabase — Base de Datos

PostgreSQL gestionado por Supabase. Las migraciones se ejecutan en orden numérico.

## Migraciones

| Archivo | Descripción |
|---|---|
| `001_initial_schema.sql` | Esquema inicial: usuarios, juegos, manifests, depot keys |
| `002_bridge_old_schema.sql` | Migración de esquema legacy a nuevo |
| `003_add_username.sql` | Añade campo username a usuarios |
| `004_add_password_resets.sql` | Tabla de reset de password |
| `005_add_password_reset_code.sql` | Código de verificación para reset de password |

## Aplicar migraciones

```bash
supabase db push
```

O manualmente con `psql` conectado a la base de datos de Supabase.
