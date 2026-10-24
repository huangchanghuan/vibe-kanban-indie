import { useEffect, useRef } from 'react';
import { ThemeMode } from 'shared/types';
import { useTheme } from '@/shared/hooks/useTheme';

interface VibeStyleOverrideMessage {
  type: 'VIBE_STYLE_OVERRIDE';
  payload:
    | {
        kind: 'cssVars';
        variables: Record<string, string>;
      }
    | {
        kind: 'theme';
        theme: ThemeMode;
      };
}

interface VibeIframeReadyMessage {
  type: 'VIBE_IFRAME_READY';
}

/**
 * Parse an "h s% l%" color string (the format the extension sends) into its
 * lightness, or null when the value doesn't match.
 */
function parseLightness(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^[\d.]+\s+[\d.]+%\s+([\d.]+)%$/);
  if (!match) return null;
  const lightness = Number(match[1]);
  return Number.isNaN(lightness) ? null : lightness;
}

/**
 * Derive light/dark from the injected editor background color.
 * Backgrounds drive readability of every surface token, so they are a more
 * reliable theme signal than the host's theme kind tag (some forks, e.g.
 * Trae, do not always tag body.vscode-dark).
 */
function deriveThemeFromVars(
  variables: Record<string, string>
): ThemeMode | null {
  const lightness = parseLightness(variables['--vscode-editor-background']);
  if (lightness === null) return null;
  return lightness < 50 ? ThemeMode.DARK : ThemeMode.LIGHT;
}

// Surface vars that feed the app's chip/panel backgrounds (bg-panel,
// bg-secondary) and must stay on the same lightness side as the editor.
const SURFACE_VARS = [
  '--vscode-input-background',
  '--vscode-editorWidget-background',
] as const;

/**
 * Some hosts (observed with Trae) report input/widget backgrounds whose
 * lightness contradicts the editor background — e.g. near-black chips on a
 * light page, unreadable against both the page and their inherited text
 * color. When a surface var lands on the opposite side of the editor
 * background, replace it with a value derived from the editor background
 * so chips/panels always match the page's lightness.
 */
// Replacement lightness for clamped surface vars, matching the app's own
// panel defaults (89% light, 16% dark) so chips stay visibly distinct from
// the canvas — near-canvas values look washed out.
const CLAMPED_LIGHTNESS = { light: 89, dark: 16 } as const;

function clampSurfaceVars(variables: Record<string, string>) {
  const editorL = parseLightness(variables['--vscode-editor-background']);
  if (editorL === null) return;

  for (const name of SURFACE_VARS) {
    const l = parseLightness(variables[name]);
    if (l === null) continue;
    const sameSide = editorL < 50 ? l < 50 : l >= 50;
    if (sameSide) continue;

    const shifted = editorL < 50 ? CLAMPED_LIGHTNESS.dark : CLAMPED_LIGHTNESS.light;
    const hueSatMatch = variables[name]?.match(/^([\d.]+\s+[\d.]+%)/);
    const hueSat = hueSatMatch?.[1] ?? '0 0%';
    variables[name] = `${hueSat} ${shifted}%`;
  }
}

// Component that adds postMessage listener for style overrides
export function AppWithStyleOverride({
  children,
  setTheme,
}: {
  children: React.ReactNode;
  setTheme: (theme: ThemeMode) => void;
}) {
  const cssVarsThemeRef = useRef<ThemeMode | null>(null);

  useEffect(() => {
    function handleStyleMessage(event: MessageEvent) {
      if (event.data?.type !== 'VIBE_STYLE_OVERRIDE') return;

      // Origin validation (only if VITE_PARENT_ORIGIN is configured)
      const allowedOrigin = import.meta.env.VITE_PARENT_ORIGIN;
      if (allowedOrigin && event.origin !== allowedOrigin) {
        console.warn(
          '[StyleOverride] Message from unauthorized origin:',
          event.origin
        );
        return;
      }

      const message = event.data as VibeStyleOverrideMessage;

      // CSS variable overrides (only --vibe-* prefixed variables)
      if (
        message.payload.kind === 'cssVars' &&
        typeof message.payload.variables === 'object'
      ) {
        const variables = { ...message.payload.variables };
        clampSurfaceVars(variables);
        Object.entries(variables).forEach(([name, value]) => {
          if (typeof value === 'string') {
            document.documentElement.style.setProperty(name, value);
          }
        });

        // Text tokens switch via the .light/.dark class; keep them in sync
        // with the injected background colors so dark vars never pair with
        // light-only text tokens (unreadable dark-on-dark).
        const derived = deriveThemeFromVars(message.payload.variables);
        if (derived) {
          cssVarsThemeRef.current = derived;
          setTheme(derived);
        }
      } else if (message.payload.kind === 'theme') {
        if (
          cssVarsThemeRef.current &&
          cssVarsThemeRef.current !== message.payload.theme
        ) {
          // The cssVars evidence contradicts the host's theme kind tag —
          // trust the actual colors (see deriveThemeFromVars).
          return;
        }
        setTheme(message.payload.theme);
      }
    }

    window.addEventListener('message', handleStyleMessage);
    return () => window.removeEventListener('message', handleStyleMessage);
  }, [setTheme]);

  // Send ready message to parent when component mounts
  useEffect(() => {
    const allowedOrigin = import.meta.env.VITE_PARENT_ORIGIN;

    // Only send if we're in an iframe and have a parent
    if (window.parent && window.parent !== window) {
      const readyMessage: VibeIframeReadyMessage = {
        type: 'VIBE_IFRAME_READY',
      };

      // Send to specific origin if configured, otherwise send to any origin
      const targetOrigin = allowedOrigin || '*';
      window.parent.postMessage(readyMessage, targetOrigin);
    }
  }, []);

  return <>{children}</>;
}

export function useStyleOverrideThemeSetter() {
  const { setTheme } = useTheme();
  return setTheme;
}
