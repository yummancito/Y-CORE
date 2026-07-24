-- Fase 13 (Optimización): índices agregados tras auditoría estática de
-- patrones where/orderBy sin cobertura — ver docs/ROADMAP.md Fase 13.

-- CreateIndex
CREATE INDEX "genres_name_idx" ON "genres"("name");

-- CreateIndex
CREATE INDEX "studios_name_idx" ON "studios"("name");

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "watchlist_user_id_created_at_idx" ON "watchlist"("user_id", "created_at");
