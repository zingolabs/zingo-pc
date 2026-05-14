import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContextApp, defaultAppState } from "./context/ContextAppState";
import { AppState } from "./components/appstate";

type CustomRenderOptions = RenderOptions & {
  contextOverrides?: Partial<AppState>;
  initialRoute?: string | { pathname: string; state?: unknown };
};

const customRender = (ui: ReactElement, options: CustomRenderOptions = {}) => {
  const { contextOverrides = {}, initialRoute = "/", ...renderOptions } = options;
  const value: AppState = { ...defaultAppState, ...contextOverrides };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={[initialRoute]}>
      <ContextApp.Provider value={value}>{children}</ContextApp.Provider>
    </MemoryRouter>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

export * from "@testing-library/react";
export { customRender as render };
