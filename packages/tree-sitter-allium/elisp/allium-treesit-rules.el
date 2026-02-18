;;; allium-treesit-rules.el --- Tree-sitter support for Allium  -*- lexical-binding: t; -*-

(defvar allium--treesit-font-lock-rules
  (treesit-font-lock-rules
   :language 'allium
   :feature 'comment
   '((comment) @font-lock-comment-face)

   :language 'allium
   :feature 'keyword
   '([
      "module" "use" "as" "rule" "entity" "external" "value" "enum"
      "context" "config" "surface" "actor" "default" "variant"
      "let" "not" "and" "or"
     ] @font-lock-keyword-face
     (clause_keyword) @font-lock-keyword-face)

   :language 'allium
   :feature 'definition
   '((rule_declaration name: (identifier) @font-lock-type-face)
     (entity_declaration name: (identifier) @font-lock-type-face)
     (external_entity_declaration name: (identifier) @font-lock-type-face)
     (value_declaration name: (identifier) @font-lock-type-face)
     (enum_declaration name: (identifier) @font-lock-type-face)
     (surface_declaration name: (identifier) @font-lock-type-face)
     (actor_declaration name: (identifier) @font-lock-type-face)
     (default_declaration type: (identifier) @font-lock-type-face)
     (variant_declaration name: (identifier) @font-lock-type-face))

   :language 'allium
   :feature 'variable
   '((field_assignment key: (identifier) @font-lock-variable-name-face)
     (let_binding name: (identifier) @font-lock-variable-name-face)
     (named_argument name: (identifier) @font-lock-variable-name-face))

   :language 'allium
   :feature 'function
   '((call_expression
      function: (identifier) @font-lock-function-name-face)
     (call_expression
      function: (member_expression
                 property: (identifier) @font-lock-function-name-face)))

   :language 'allium
   :feature 'string
   '((string_literal) @font-lock-string-face
     (string_interpolation
      "{" @font-lock-punctuation-face
      (identifier) @font-lock-variable-name-face
      "}" @font-lock-punctuation-face))

   :language 'allium
   :feature 'constant
   '((boolean_literal) @font-lock-constant-face
     (null_literal) @font-lock-constant-face
     (number_literal) @font-lock-constant-face
     (duration_literal) @font-lock-constant-face)

   :language 'allium
   :feature 'operator
   '([
      "=" "==" "!=" "<" ">" "<=" ">=" "=>"
      "+" "-" "*" "/" "|"
     ] @font-lock-warning-face)

   :language 'allium
   :feature 'punctuation
   '([ "(" ")" "{" "}" ":" "," "." ] @font-lock-punctuation-face)))

(defvar allium--treesit-defun-type-regexp
  (rx (or "rule_declaration"
          "entity_declaration"
          "external_entity_declaration"
          "value_declaration"
          "enum_declaration"
          "surface_declaration"
          "actor_declaration"
          "context_block"
          "config_block"
          "default_declaration"
          "variant_declaration")))

(defun allium--treesit-defun-name (node)
  "Return the name of the defun NODE."
  (pcase (treesit-node-type node)
    ((or "rule_declaration" "entity_declaration" "external_entity_declaration"
         "value_declaration" "enum_declaration" "surface_declaration"
         "actor_declaration" "variant_declaration")
     (treesit-node-text (treesit-node-child-by-field-name node "name") t))
    ("default_declaration"
     (treesit-node-text (treesit-node-child-by-field-name node "name") t))
    ("context_block" "context")
    ("config_block" "config")))

(defvar allium--treesit-imenu-settings
  '(("Rule" "`rule_declaration'" nil nil)
    ("Entity" "`e\(?:ntity\|xternal_entity\)_declaration'" nil nil)
    ("Value" "`value_declaration'" nil nil)
    ("Enum" "`enum_declaration'" nil nil)
    ("Config" "`config_block'" nil nil)
    ("Context" "`context_block'" nil nil)))

(provide 'allium-treesit-rules)
