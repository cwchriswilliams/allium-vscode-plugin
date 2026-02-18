#include <napi.h>

typedef struct TSLanguage TSLanguage;

extern "C" const TSLanguage *tree_sitter_allium();

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "name"), Napi::String::New(env, "allium"));
    Napi::Function language = Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return Napi::External<TSLanguage>::New(info.Env(), const_cast<TSLanguage*>(tree_sitter_allium()));
    }, "language");
    exports.Set(Napi::String::New(env, "language"), language);
    return exports;
}

NODE_API_MODULE(tree_sitter_allium_binding, Init)
