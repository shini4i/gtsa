{
  description = "Development flake for gitlab-token-scope-adjuster";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_22;
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            nodejs
            pkgs.nodePackages.ts-node
            pkgs.go-task
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            export NPM_CONFIG_FUND=0
            export NPM_CONFIG_AUDIT=0

            if [ ! -d node_modules ]; then
              echo "Installing npm dependencies using package-lock.json..."
              npm ci
            fi
          '';
        };
      });
}
