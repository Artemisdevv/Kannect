"""Shared SQL for current stock per (shop, product), used by public search and supplier insight."""

# Latest absolute correction plus later restocks and sales (mirrors app.stock.stock_quantity).
STOCK_CTE = """
stock AS (
  SELECT sp.shop_id, sp.product_id, sp.price, sp.low_threshold,
         COALESCE(c.quantity, 0) + COALESCE(SUM(
           CASE e.type WHEN 'restock' THEN e.quantity WHEN 'sale' THEN -e.quantity ELSE 0 END
         ), 0) AS qty
  FROM shop_product sp
  LEFT JOIN LATERAL (
    SELECT quantity, created_at, id FROM stock_event
    WHERE shop_id = sp.shop_id AND product_id = sp.product_id AND type = 'correction'
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) c ON true
  LEFT JOIN stock_event e
    ON e.shop_id = sp.shop_id AND e.product_id = sp.product_id AND e.type <> 'correction'
   AND (c.created_at IS NULL OR (e.created_at, e.id::text) > (c.created_at, c.id::text))
  GROUP BY sp.shop_id, sp.product_id, sp.price, sp.low_threshold, c.quantity
)
"""

STATUS_SQL = """CASE WHEN st.qty <= 0 THEN 'out'
                      WHEN st.qty < st.low_threshold THEN 'low'
                      ELSE 'in_stock' END"""
