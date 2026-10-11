from sqlalchemy import Numeric, UniqueConstraint
from sqlalchemy.orm import configure_mappers

import app.models as models
from app.db import Base


def test_domain_models_register_and_relationships_configure():
    configure_mappers()
    assert len(models.__all__) == 6
    assert set(Base.metadata.tables) == {
        "shop",
        "product",
        "shop_product",
        "stock_event",
        "bill",
        "bill_line",
    }


def test_money_columns_use_contract_precision():
    for table_name, column_names in {
        "product": ["mrp"],
        "shop_product": ["price", "cost_price"],
        "bill": ["total"],
        "bill_line": ["unit_price", "line_total"],
    }.items():
        for column_name in column_names:
            column_type = Base.metadata.tables[table_name].columns[column_name].type
            assert isinstance(column_type, Numeric)
            assert (column_type.precision, column_type.scale) == (10, 2)


def test_historical_product_references_restrict_hard_delete():
    product_table = Base.metadata.tables["product"]
    shop_product_table = Base.metadata.tables["shop_product"]
    bill_line_table = Base.metadata.tables["bill_line"]

    assert next(iter(product_table.c.merged_into_id.foreign_keys)).ondelete == "RESTRICT"
    assert next(iter(shop_product_table.c.product_id.foreign_keys)).ondelete == "RESTRICT"
    assert next(iter(bill_line_table.c.product_id.foreign_keys)).ondelete == "RESTRICT"


def test_idempotency_keys_are_scoped_to_shop():
    for table_name, expected_columns in {
        "bill": ("shop_id", "client_id"),
        "stock_event": ("shop_id", "client_id"),
    }.items():
        unique_column_sets = {
            tuple(column.name for column in constraint.columns)
            for constraint in Base.metadata.tables[table_name].constraints
            if isinstance(constraint, UniqueConstraint)
        }
        assert expected_columns in unique_column_sets


def test_shop_phone_is_unique_for_owner_resolution():
    constraints = Base.metadata.tables["shop"].constraints
    assert any(
        isinstance(constraint, UniqueConstraint)
        and tuple(column.name for column in constraint.columns) == ("phone",)
        for constraint in constraints
    )


def test_stock_events_reference_a_shop_product_pair():
    constraints = Base.metadata.tables["stock_event"].foreign_key_constraints
    pair_fk = next(
        constraint for constraint in constraints if constraint.name == "fk_stock_event_shop_product"
    )
    assert tuple(element.parent.name for element in pair_fk.elements) == ("shop_id", "product_id")
    assert tuple(element.target_fullname for element in pair_fk.elements) == (
        "shop_product.shop_id",
        "shop_product.product_id",
    )
    assert pair_fk.ondelete == "RESTRICT"
