# ==========================================
# 阶段一：编译构建阶段 (多架构自动适配)
# ==========================================
FROM --platform=$BUILDPLATFORM golang:1.22-alpine AS builder

RUN apk add --no-cache git

WORKDIR /src

# 1. 直接复制当前目录下的依赖描述文件并下载
COPY go.mod go.sum ./
RUN go mod download

# 2. 复制项目所有的源文件 (包括 main.go 和 internal 文件夹等)
COPY . .

# 3. 读取多架构参数，自动进行交叉编译
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o /app-bin .
# ==========================================
# 阶段二：极简运行阶段 (Alpine 镜像)
# ==========================================
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# 1. 从构建阶段把编译好的 Go 二进制程序复制过来
COPY --from=builder /app-bin /app/app-bin

# 2. 【核心修改】把所有的前端网页静态资源全部打包进容器！
COPY index.html /app/index.html
COPY proxy-parser.js /app/proxy-parser.js
COPY pages/ /app/pages/
COPY assets/ /app/assets/
COPY rules/ /app/rules/

# 暴露端口 (对应你的 Go 监听端口 8080)
EXPOSE 8080

# 启动程序
CMD ["/app/app-bin"]
