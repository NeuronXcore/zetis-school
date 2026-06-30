from pydantic import BaseModel, Field


# --- Entrées (Papa crée) ---------------------------------------------------


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=20)
    icon: str | None = Field(default=None, max_length=20)


class ThemeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None


class ChapterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    period: str | None = Field(default=None, max_length=40)


# --- Sorties ----------------------------------------------------------------


class ChapterOut(BaseModel):
    id: int
    name: str
    description: str | None
    period: str | None
    status: str
    sort_order: int


class ThemeOut(BaseModel):
    id: int
    name: str
    description: str | None
    sort_order: int
    chapters: list[ChapterOut]


class SubjectOut(BaseModel):
    id: int
    name: str
    slug: str
    color: str | None
    icon: str | None
    sort_order: int
    is_active: bool
    theme_count: int
    chapter_count: int


class SubjectDetailOut(SubjectOut):
    themes: list[ThemeOut]
