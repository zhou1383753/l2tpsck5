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

# 1. 复制编译出来的二进制程序
COPY --from=builder /app-bin /app/app-bin

# 2. 【新增这一行】把项目根目录下的 index.html 复制到容器内的 /app 目录下
COPY index.html /app/index.html

# 暴露端口 (对应你的 Go 监听端口 8080)
EXPOSE 8080

# 启动程序
CMD ["/app/app-bin"]
