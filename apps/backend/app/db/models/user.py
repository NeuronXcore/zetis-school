from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20))  # child | parent | admin
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)


class StudentProfile(Base, TimestampMixin):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    first_name: Mapped[str] = mapped_column(String(120))
    school_level_current: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # High-water mark du témoin de nouveauté de l'agenda (addendum adr-0025 §12.3).
    # Écrit à l'ouverture de /agenda ET au rendu du bandeau d'Accueil — les deux surfaces où
    # Massimo lit ce qui est arrivé ; n'en retenir qu'une ferait mentir le témoin.
    #
    # UN horodatage PAR ÉLÈVE, jamais un `seen_at` PAR ITEM : joint à `done_at`, celui-ci
    # fabriquerait la donnée persistée « vu le 12, jamais fait », lisible côté Papa par
    # l'asymétrie de visibilité — la surveillance par la porte de service que l'adr-0025
    # condamne, et un objet PIRE que le compteur qu'on évitait. La granularité EST la protection.
    #
    # Ne sort d'aucune route : absent de `AgendaItemPilotOut` et de toute réponse /api/agenda
    # (symétrique exact de `parent_note` ; test de non-fuite dans `test_agenda.py`).
    agenda_last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Jour où la dernière alerte de retard a été montrée (adr-0025 Amdt 9 §D12).
    #
    # 🔴 **UNE DATE PAR ÉLÈVE, et c'est le contournement d'un blocage écrit juste au-dessus.**
    # Savoir « quel retard est NOUVEAU » demande naïvement une marque PAR ITEM — celle que le
    # commentaire d'`agenda_last_seen_at` interdit, parce que jointe à `done_at` elle fabriquerait
    # « vu le 12, jamais fait » : de la surveillance par la porte de service. Une seule date par
    # élève suffit : « nouveau » = *une échéance dont la date est tombée depuis ce jour-là*, et
    # « une fois par jour » se lit sur la même colonne. Rien par item, donc rien à dériver.
    #
    # ⚠️ `Date` et non `DateTime` : la borne est un JOUR (« pas deux fois le même jour »), et un
    # horodatage inviterait à comparer des heures — donc à reconstituer un rythme de visite.
    #
    # Ne sort d'aucune route, exactement comme son voisin : test de non-fuite dans `test_agenda.py`.
    agenda_late_alert_on: Mapped[date | None] = mapped_column(Date, nullable=True)
