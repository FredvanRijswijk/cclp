import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useMemo,
  makeTheme,
  isEnterKey,
  isUpKey,
  isDownKey,
  CancelPromptError,
} from "@inquirer/core";
import pc from "picocolors";

type Choice<T> = {
  name: string;
  value: T;
  description?: string;
  disabled?: boolean | string;
};

type Config<T> = {
  message: string;
  choices: readonly Choice<T>[];
  pageSize?: number;
};

export async function vimSelect<T>(config: Config<T>): Promise<T> {
  const { choices, pageSize = 15, message } = config;

  return createPrompt<T, Config<T>>(
    (cfg, done) => {
      const theme = makeTheme({});
      const prefix = usePrefix({ theme });

      const selectableChoices = useMemo(
        () => cfg.choices.filter((c) => !c.disabled),
        [cfg.choices]
      );

      const [active, setActive] = useState(0);
      const [status, setStatus] = useState<"idle" | "done">("idle");

      useKeypress((key, rl) => {
        if (status === "done") return;

        if (key.name === "escape" || (key.ctrl && key.name === "c")) {
          setStatus("done");
          rl.close();
          throw new CancelPromptError();
        } else if (isEnterKey(key)) {
          const selected = selectableChoices[active];
          if (selected) {
            setStatus("done");
            done(selected.value);
          }
        } else if (isUpKey(key) || key.name === "k") {
          const next = active - 1;
          if (next >= 0) setActive(next);
        } else if (isDownKey(key) || key.name === "j") {
          const next = active + 1;
          if (next < selectableChoices.length) setActive(next);
        } else if (key.name === "g") {
          setActive(0);
        } else if (key.name === "G") {
          setActive(selectableChoices.length - 1);
        }
      });

      const page = usePagination({
        items: selectableChoices,
        active,
        renderItem: ({ item, isActive }: { item: Choice<T>; isActive: boolean }) => {
          const color = isActive ? pc.cyan : (x: string) => x;
          const cursor = isActive ? pc.cyan("❯") : " ";
          const line = `${cursor} ${item.name}`;

          if (item.description && isActive) {
            return `${color(line)}\n  ${pc.dim(item.description)}`;
          }
          return color(line);
        },
        pageSize: cfg.pageSize || 15,
      });

      if (status === "done") {
        const selected = selectableChoices[active];
        return `${prefix} ${cfg.message} ${pc.cyan(selected?.name || "")}`;
      }

      const hint = pc.dim("(j/k, enter, esc)");
      return `${prefix} ${cfg.message} ${hint}\n${page}`;
    }
  )(config);
}
