ALTER TABLE campaigns_entitlements
  ADD COLUMN quantity numeric(78,0) NOT NULL DEFAULT 1;

ALTER TABLE campaigns_entitlements
  ADD CONSTRAINT campaigns_entitlements_quantity_check CHECK (quantity > 0);
