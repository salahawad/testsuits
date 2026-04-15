import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { Login } from "../pages/Login";

describe("Login page", () => {
  it("renders email + password inputs and a submit button", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <Login />
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    // The form has email + password inputs and a sign-in submit button.
    const inputs = document.querySelectorAll('input[type="email"], input[type="password"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /sign in|se connecter/i })).toBeInTheDocument();
  });
});
