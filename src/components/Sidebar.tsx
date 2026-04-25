import { useEffect, useRef, useState } from "react";
import { fileTitleFor } from "../lib/manuscript";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import type { ProjectFile, ProjectMetadata } from "../lib/types";

const sceneEmojiOptions = [
  { emoji: "✍️", label: "draft writing sketch набросок черновик писать" },
  { emoji: "📝", label: "notes edit rewrite правка заметки редактировать" },
  { emoji: "🕳️", label: "hole gap missing дырка пробел дописать" },
  { emoji: "🚧", label: "work in progress build стройка работа процесс" },
  { emoji: "✅", label: "ready done complete готово закончено" },
  { emoji: "☑️", label: "checked reviewed проверено просмотрено" },
  { emoji: "🏁", label: "finish final end финал конец финиш" },
  { emoji: "🔥", label: "hot important fire flame важно кульминация огонь пламя" },
  { emoji: "⭐", label: "favorite star key ключевое любимое" },
  { emoji: "💎", label: "polished gem strong сильное отполировано" },
  { emoji: "❗", label: "warning important attention важно внимание" },
  { emoji: "⚠️", label: "warning risk problem риск проблема" },
  { emoji: "❓", label: "question unclear проверить вопрос непонятно" },
  { emoji: "🔍", label: "research check investigate поиск проверить исследовать" },
  { emoji: "💬", label: "dialogue talk реплика диалог разговор" },
  { emoji: "👂", label: "listen overhear слышать слушать подслушать" },
  { emoji: "🤫", label: "secret silence quiet тайна молчание секрет" },
  { emoji: "🧭", label: "direction transition route переход путь структура" },
  { emoji: "🔁", label: "repeat loop callback повтор рифма возвращение" },
  { emoji: "🔀", label: "branch choice fork выбор развилка" },
  { emoji: "⏭️", label: "skip jump later пропуск позже перескок" },
  { emoji: "⏳", label: "time waiting delay время ожидание задержка" },
  { emoji: "⏱️", label: "pace timing rhythm темп ритм время" },
  { emoji: "🌙", label: "night quiet mood ночь настроение" },
  { emoji: "☀️", label: "day sun light день солнце свет" },
  { emoji: "🌧️", label: "rain sadness weather дождь погода грусть" },
  { emoji: "❄️", label: "snow winter cold снег зима холод" },
  { emoji: "🌲", label: "forest woods nature лес природа" },
  { emoji: "🏠", label: "home house room дом комната" },
  { emoji: "🏰", label: "castle palace power замок дворец власть" },
  { emoji: "🏙️", label: "city town urban город" },
  { emoji: "🛤️", label: "road travel path дорога путь путешествие" },
  { emoji: "⚔️", label: "conflict fight battle конфликт бой" },
  { emoji: "🏃", label: "run chase action бежать погоня действие" },
  { emoji: "💥", label: "impact explosion shock удар взрыв шок" },
  { emoji: "🩸", label: "blood wound injury кровь рана" },
  { emoji: "🛡️", label: "protect defense shield защита" },
  { emoji: "🗡️", label: "knife blade threat нож угроза" },
  { emoji: "💔", label: "emotion heartbreak pain эмоция боль" },
  { emoji: "❤️", label: "love heart affection любовь сердце" },
  { emoji: "😢", label: "sad cry sadness грусть плач" },
  { emoji: "😡", label: "anger rage злость гнев" },
  { emoji: "😨", label: "fear scared страх испуг" },
  { emoji: "😄", label: "joy happy радость счастье" },
  { emoji: "😬", label: "awkward tension неловко напряжение" },
  { emoji: "🤔", label: "thinking doubt мысль сомнение" },
  { emoji: "🧩", label: "puzzle missing logic puzzle логика кусок" },
  { emoji: "🧠", label: "idea thought mind идея мысль разум" },
  { emoji: "💡", label: "insight idea light идея озарение" },
  { emoji: "🎭", label: "character drama role персонаж драма роль" },
  { emoji: "👤", label: "character person герой персонаж человек" },
  { emoji: "👥", label: "group crowd people группа люди толпа" },
  { emoji: "👑", label: "king queen power crown власть король королева" },
  { emoji: "🧙", label: "magic wizard магия волшебник" },
  { emoji: "👻", label: "ghost supernatural дух призрак мистика" },
  { emoji: "📌", label: "pin note marker заметка пометка" },
  { emoji: "📎", label: "attach link related связь прикрепить" },
  { emoji: "📖", label: "lore exposition book лор экспозиция книга" },
  { emoji: "🗺️", label: "map world place карта мир место" },
  { emoji: "🌍", label: "earth world globe земля мир планета" },
  { emoji: "🌊", label: "water sea ocean river вода море океан река" },
  { emoji: "🌪️", label: "storm tornado chaos буря шторм хаос" },
  { emoji: "🌫️", label: "fog mist туман мгла" },
  { emoji: "🌸", label: "flower spring blossom цветок весна" },
  { emoji: "🌿", label: "leaf herb plant растение трава лист" },
  { emoji: "🍄", label: "mushroom fungi гриб грибы" },
  { emoji: "🐺", label: "wolf animal beast волк зверь животное" },
  { emoji: "🐦", label: "bird птица" },
  { emoji: "🐍", label: "snake serpent змея" },
  { emoji: "🐉", label: "dragon дракон" },
  { emoji: "🐴", label: "horse лошадь конь" },
  { emoji: "🐈", label: "cat кошка кот" },
  { emoji: "🐕", label: "dog собака пес" },
  { emoji: "🤖", label: "robot machine ai робот машина ии" },
  { emoji: "👽", label: "alien stranger инопланетянин чужой" },
  { emoji: "💀", label: "death skull dead смерть череп мертвый" },
  { emoji: "👁️", label: "eye see watch глаз видеть наблюдать" },
  { emoji: "🖐️", label: "hand touch palm рука ладонь трогать" },
  { emoji: "🫂", label: "hug embrace support объятие поддержка" },
  { emoji: "💋", label: "kiss поцелуй" },
  { emoji: "🩹", label: "heal bandage wound лечение рана пластырь" },
  { emoji: "🍞", label: "bread food еда хлеб" },
  { emoji: "🍎", label: "apple fruit яблоко фрукт" },
  { emoji: "🍷", label: "wine drink вино напиток" },
  { emoji: "☕", label: "coffee tea drink кофе чай напиток" },
  { emoji: "🍽️", label: "meal dinner food еда ужин стол" },
  { emoji: "🚗", label: "car auto vehicle машина авто автомобиль" },
  { emoji: "🚕", label: "taxi cab такси" },
  { emoji: "🚌", label: "bus автобус" },
  { emoji: "🚂", label: "train поезд" },
  { emoji: "✈️", label: "plane flight airplane самолет полет" },
  { emoji: "🚀", label: "rocket space ракета космос" },
  { emoji: "⛵", label: "boat ship sail лодка корабль парус" },
  { emoji: "🚪", label: "door entrance exit дверь вход выход" },
  { emoji: "🪟", label: "window окно" },
  { emoji: "🛏️", label: "bed sleep кровать сон" },
  { emoji: "🪑", label: "chair seat стул кресло" },
  { emoji: "🪞", label: "mirror reflection зеркало отражение" },
  { emoji: "🕯️", label: "candle light свеча свет" },
  { emoji: "🗝️", label: "key ключ" },
  { emoji: "📦", label: "box package коробка посылка" },
  { emoji: "🎁", label: "gift present подарок" },
  { emoji: "💰", label: "money gold coin деньги золото монеты" },
  { emoji: "⚖️", label: "law justice balance закон справедливость весы" },
  { emoji: "🧲", label: "magnet attraction магнит притяжение" },
  { emoji: "🔔", label: "bell alarm колокол звонок тревога" },
  { emoji: "📣", label: "announcement shout объявление крик" },
  { emoji: "🎵", label: "music song музыка песня" },
  { emoji: "🎨", label: "art paint искусство краска" },
  { emoji: "🎬", label: "scene film cinema сцена кино" },
  { emoji: "🎲", label: "chance dice random случай кубик" },
  { emoji: "🃏", label: "joker trick card шут карта обман" },
  { emoji: "🏹", label: "bow arrow hunt лук стрела охота" },
  { emoji: "🔫", label: "gun pistol weapon пистолет оружие" },
  { emoji: "💣", label: "bomb explosion bomb бомба взрыв" },
  { emoji: "🧰", label: "toolbox tools инструменты ящик" },
  { emoji: "🪓", label: "axe топор" },
  { emoji: "⛏️", label: "pickaxe mine кирка шахта" },
  { emoji: "🧱", label: "brick wall block кирпич стена блок" },
  { emoji: "⚙️", label: "gear mechanism механизм шестеренка" },
  { emoji: "💻", label: "computer laptop комп компьютер ноутбук" },
  { emoji: "📱", label: "phone mobile телефон смартфон" },
  { emoji: "📷", label: "camera photo камера фото" },
  { emoji: "🔦", label: "flashlight torch фонарь свет" },
  { emoji: "📚", label: "books library книги библиотека" },
  { emoji: "📜", label: "scroll letter ancient свиток письмо древний" },
  { emoji: "✉️", label: "letter mail письмо почта" },
  { emoji: "📰", label: "news newspaper газета новости" },
  { emoji: "🔖", label: "bookmark закладка" },
  { emoji: "🧾", label: "receipt list чек список" },
  { emoji: "📅", label: "calendar date календарь дата" },
  { emoji: "🕰️", label: "clock time часы время" },
  { emoji: "🔮", label: "crystal prophecy magic шар пророчество магия" },
  { emoji: "🪄", label: "wand spell magic палочка заклинание магия" },
  { emoji: "🧿", label: "amulet evil eye амулет глаз оберег" },
  { emoji: "💊", label: "medicine pill лекарство таблетка" },
  { emoji: "🧬", label: "dna biology генетика днк биология" },
  { emoji: "⚗️", label: "alchemy chemistry алхимия химия" },
  { emoji: "🪐", label: "planet space планета космос" },
  { emoji: "🎯", label: "goal target цель задача" },
  { emoji: "🧪", label: "experiment test try тест эксперимент попробовать" },
  { emoji: "✂️", label: "cut remove delete резать удалить сократить" },
  { emoji: "🧹", label: "clean cleanup polish чистка убрать" },
  { emoji: "🔧", label: "fix repair tool исправить чинить" },
  { emoji: "🔒", label: "locked fixed final lock зафиксировано" },
  { emoji: "🔓", label: "unlocked open свободно открыто" },
  { emoji: "🚫", label: "blocked no stop блок стоп нельзя" },
];

type SidebarProps = {
  files: ProjectFile[];
  selectedPaths: string[];
  activePath: string | null;
  metadata: ProjectMetadata;
  dropIndex: number | null;
  onRowClick: (
    path: string,
    index: number,
    event: MouseEvent<HTMLButtonElement>,
  ) => void;
  onSelectAll: () => void;
  onCreateFile: () => void;
  onDeleteSelected: () => void;
  onRenameFile: (path: string, title: string) => Promise<boolean>;
  onSetSceneEmoji: (emoji: string) => void;
  onPointerDragStart: (path: string) => void;
  onPointerDragEnd: () => void;
  onSetDropIndex: (index: number) => void;
};

export function Sidebar({
  files,
  selectedPaths,
  activePath,
  metadata,
  dropIndex,
  onRowClick,
  onSelectAll,
  onCreateFile,
  onDeleteSelected,
  onRenameFile,
  onSetSceneEmoji,
  onPointerDragStart,
  onPointerDragEnd,
  onSetDropIndex,
}: SidebarProps) {
  const selectedSet = new Set(selectedPaths);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const skipNextSubmitRef = useRef(false);
  const submittingRef = useRef(false);
  const usedEmojiSet = new Set<string>();
  const usedEmojis = files.reduce<string[]>((emojis, file) => {
    const emoji = metadata.scenes[file.relativePath]?.emoji?.trim();

    if (!emoji || usedEmojiSet.has(emoji)) {
      return emojis;
    }

    usedEmojiSet.add(emoji);
    emojis.push(emoji);
    return emojis;
  }, []);

  function setSceneEmoji(emoji: string) {
    onSetSceneEmoji(emoji);
    setEmojiPickerOpen(false);
    setEmojiSearch("");
  }

  const filteredEmojiOptions = sceneEmojiOptions.filter((option) => {
    const query = emojiSearch.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      option.emoji.includes(query) ||
      option.label.toLowerCase().includes(query)
    );
  });

  function startEditing(file: ProjectFile) {
    setEditingPath(file.path);
    setDraftTitle(fileTitleFor(file.relativePath));
  }

  function cancelEditing() {
    setEditingPath(null);
    setDraftTitle("");
  }

  async function submitEditing(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (skipNextSubmitRef.current) {
      skipNextSubmitRef.current = false;
      return;
    }

    if (!editingPath) {
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    try {
      const renamed = await onRenameFile(editingPath, draftTitle);
      if (renamed) {
        cancelEditing();
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipNextSubmitRef.current = true;
      cancelEditing();
    }
  }

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        emojiPickerRef.current?.contains(event.target)
      ) {
        return;
      }

      setEmojiPickerOpen(false);
      setEmojiSearch("");
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setEmojiPickerOpen(false);
      setEmojiSearch("");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [emojiPickerOpen]);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__actions">
          <button type="button" onClick={onSelectAll} title="Select all" aria-label="Select all">
            📚
          </button>
          <div className="emoji-picker" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((open) => !open)}
              disabled={selectedPaths.length === 0}
              title="Set scene emoji"
              aria-label="Set scene emoji"
            >
              🏷️
            </button>
            {emojiPickerOpen ? (
              <div className="emoji-picker__panel">
                {usedEmojis.length > 0 ? (
                  <div className="emoji-picker__section">
                    <div className="emoji-picker__label">Used</div>
                    <div className="emoji-picker__grid">
                      {usedEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setSceneEmoji(emoji)}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <form
                  className="emoji-picker__custom"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const firstMatch = filteredEmojiOptions[0];

                    if (firstMatch) {
                      setSceneEmoji(firstMatch.emoji);
                    }
                  }}
                >
                  <input
                    value={emojiSearch}
                    onChange={(event) => setEmojiSearch(event.target.value)}
                    placeholder="Search"
                    aria-label="Search emoji"
                  />
                </form>
                <div className="emoji-picker__grid">
                  {filteredEmojiOptions.map((option) => (
                    <button
                      key={option.emoji}
                      type="button"
                      onClick={() => setSceneEmoji(option.emoji)}
                      title={option.label}
                    >
                      {option.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onCreateFile} title="New file" aria-label="New file">
            ➕
          </button>
          <button
            type="button"
            className="sidebar__action--danger"
            onClick={onDeleteSelected}
            disabled={selectedPaths.length === 0}
            title="Delete selected"
            aria-label="Delete selected"
          >
            🗑️
          </button>
        </div>
      </div>
      <div className="sidebar__list">
        <div
          className={`drop-slot${dropIndex === 0 ? " drop-slot--active" : ""}`}
          onMouseEnter={() => onSetDropIndex(0)}
        />
        {files.map((file, index) => (
          <div key={file.path} className="file-entry">
            {editingPath === file.path ? (
              <form className="file-row file-row--editing" onSubmit={submitEditing}>
                <input
                  value={draftTitle}
                  autoFocus
                  onBlur={() => {
                    void submitEditing();
                  }}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={handleEditKeyDown}
                />
              </form>
            ) : (
              <button
                type="button"
                className={`file-row${selectedSet.has(file.path) ? " file-row--selected" : ""}${activePath === file.path ? " file-row--active" : ""}`}
                onClick={(event) => onRowClick(file.path, index, event)}
                onDoubleClick={() => startEditing(file)}
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  onPointerDragStart(file.path);
                }}
                onMouseUp={() => onPointerDragEnd()}
                title={file.relativePath}
              >
                <span className="file-row__status">
                  {metadata.scenes[file.relativePath]?.emoji ?? ""}
                </span>
                <span>{fileTitleFor(file.relativePath)}</span>
              </button>
            )}
            <div
              className={`drop-slot${dropIndex === index + 1 ? " drop-slot--active" : ""}`}
              onMouseEnter={() => onSetDropIndex(index + 1)}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
