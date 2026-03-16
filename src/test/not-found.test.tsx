import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "@/pages/NotFound";

describe("NotFound", () => {
  it("shows a 404 message and return link", () => {
    render(
      <MemoryRouter
        initialEntries={["/missing-route"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NotFound />
      </MemoryRouter>,
    );

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();

    const homeLink = screen.getByRole("link", { name: "Return to Home" });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
