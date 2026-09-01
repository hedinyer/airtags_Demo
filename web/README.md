# Motos cercanas (AirTags + cartera)

App Next.js que pide tu GPS, cruza AirTags (`locations.json`) con atrasos de Postgres y lista motos con deuda a ≤ 5 km.

Sin clave de acceso. `DATABASE_URL` tiene fallback hardcodeado (misma Postgres que recuperadores).

## Desarrollo

```bash
cd web
npm install
npm run dev
```

## Despliegue

Proyecto Vercel aparte con root directory `web/`. El mapa Find My estático (`index.html` en la raíz del repo) no se modifica.
