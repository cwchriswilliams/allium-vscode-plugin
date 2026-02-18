{
  "targets": [
    {
      "target_name": "tree_sitter_allium_binding",
      "include_dirs": [
        "src",
        "<!(node -p \"require('node-addon-api').include_dir\")"
      ],
      "sources": [
        "bindings/node/binding.cc",
        "src/parser.c"
      ],
      "cflags_c": [
        "-std=c11"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}
