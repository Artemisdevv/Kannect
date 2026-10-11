p="app/routers/catalogue.py"
s=open(p,encoding="utf-8").read()
s=s.replace("from pydantic import BaseModel\nfrom sqlalchemy import or_, select","from fastapi.responses import JSONResponse\nfrom pydantic import BaseModel, field_validator\nfrom sqlalchemy import or_, select")
s=s.replace("from app.models import Product\n","from app.models import Product\nfrom app.services.catalogue_match import STRONG, CatalogueIndex, norm\n")
s=s.replace('''class ProductResponse(ProductInput):''','''class ProductCreate(ProductInput):
    """Create input. `allow_similar` confirms a new product even if a near duplicate exists."""

    allow_similar: bool = False

    @field_validator("barcode", mode="before")
    @classmethod
    def clean_barcode(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        if not value:
            return None
        if not (value.isdigit() and 6 <= len(value) <= 14):
            raise ValueError("barcode must be 6 to 14 digits")
        return value

    @field_validator("name", "brand", "size", mode="before")
    @classmethod
    def clean_text(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value


class ProductResponse(ProductInput):''',1)
s=s.replace('''@router.post("/products", status_code=201, response_model=ProductResponse)
def create_product(
    request: ProductInput,''','''def _similar_products(db: Session, request: ProductCreate) -> list[Product]:
    """Active products that look like the same item, so a scan does not fork the catalogue.

    Different sizes are different products (100g vs 200g have different barcodes), so a size
    mismatch rules a candidate out.
    """
    words = [w for w in norm(f"{request.brand} {request.name}").split() if len(w) > 2]
    if not words:
        return []
    statement = (
        select(Product)
        .where(
            Product.is_active.is_(True),
            or_(*(Product.name.ilike(f"%{w}%") for w in words[:3])),
        )
        .limit(400)
    )
    pool = list(db.scalars(statement).all())
    size = norm(request.size)
    if size:
        pool = [p for p in pool if not p.size or norm(p.size) == size]
    matches = CatalogueIndex(pool).match(request.brand or "", request.name, request.size or "")
    return [m.product for m in matches if m.score >= STRONG]


@router.post("/products", status_code=201, response_model=ProductResponse)
def create_product(
    request: ProductCreate,''')
s=s.replace('''    product = Product(**request.model_dump())
    db.add(product)''','''    if not request.allow_similar:
        similar = _similar_products(db, request)
        if similar:
            return JSONResponse(
                status_code=409,
                content={
                    "error": {
                        "code": "similar_product",
                        "message": "A similar product exists. Use it, or resend with "
                        "allow_similar=true to add this as a new product.",
                        "candidates": [_product_response(p) for p in similar],
                    }
                },
            )

    product = Product(**request.model_dump(exclude={"allow_similar"}))
    db.add(product)''')
open(p,"w",encoding="utf-8").write(s)
