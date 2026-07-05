DO $$
DECLARE
  sid uuid := '4f980e40-08e4-44d4-9efd-c24860151178';
  daily_rev numeric;
  daily_ord int;
  life_rev numeric;
  life_ord int;
BEGIN
  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO daily_rev, daily_ord
  FROM processed_orders
  WHERE store_id = sid
    AND processed_at >= CURRENT_DATE
    AND status NOT IN ('cancelled','refunded');

  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO life_rev, life_ord
  FROM processed_orders
  WHERE store_id = sid
    AND status NOT IN ('cancelled','refunded');

  UPDATE stores SET cap_window_revenue = daily_rev WHERE id = sid;

  IF EXISTS (SELECT 1 FROM store_stats WHERE store_id = sid AND date = CURRENT_DATE) THEN
    UPDATE store_stats SET
      shopify_daily_orders = daily_ord,
      shopify_daily_revenue = daily_rev,
      shopify_total_orders = life_ord,
      shopify_total_revenue = life_rev,
      last_sync = now()
    WHERE store_id = sid AND date = CURRENT_DATE;
  ELSE
    INSERT INTO store_stats (store_id, date, shopify_daily_orders, shopify_daily_revenue, shopify_total_orders, shopify_total_revenue, last_sync)
    VALUES (sid, CURRENT_DATE, daily_ord, daily_rev, life_ord, life_rev, now());
  END IF;
END $$;