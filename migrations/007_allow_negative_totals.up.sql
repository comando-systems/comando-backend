-- A discount may exceed items plus surcharge (a gift credit), so totals can be negative.
-- Existing zero-total closed orders stay in history; the rule applies to new writes only.
ALTER TABLE orders DROP CONSTRAINT orders_total_nonnegative;

CREATE FUNCTION orders_reject_zero_total_on_close() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'CLOSED' AND NEW.total_amount_cents = 0
       AND (TG_OP = 'INSERT' OR OLD.status <> 'CLOSED' OR OLD.total_amount_cents <> 0) THEN
        RAISE EXCEPTION 'A closed order must have a non-zero total';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_reject_zero_total_on_close
    BEFORE INSERT OR UPDATE OF status, total_amount_cents ON orders
    FOR EACH ROW EXECUTE FUNCTION orders_reject_zero_total_on_close();
