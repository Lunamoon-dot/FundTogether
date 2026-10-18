ALTER TABLE campaigns_creator_profiles
  ADD COLUMN studio_wallet_link_id uuid REFERENCES wallet_links(id);
