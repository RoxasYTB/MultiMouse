{
  "targets": [
    {
      "target_name": "multimouse_raw_input",
      "sources": [
        "src/multimouse_addon.cpp"
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "libraries": [
        "-luser32.lib"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX"
          ]
        }]
      ]
    }
  ]
}